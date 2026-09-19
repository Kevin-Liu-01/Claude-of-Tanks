// Real-pointer selection coverage, timing and compositor evidence. Owns the
// capture FIFO; never wrap this tool in another capture lease.
// node tools/tank-selection-probe.mjs --surface=gallery --ids=a,b --out=.qa/selection
// Garage also accepts --tier=desktop|mobile. Gallery's production tier is HIGH.
// UI readiness, RAF callbacks and screenshot completion are distinct events:
// the latter is an upper bound on visible paint, never a first-photon claim.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { createCaptureLock } from './capture-lock.mjs';

const option = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const surface = option('surface', 'gallery');
const ids = option('ids', '').split(',').filter(Boolean);
const output = resolve(option('out', '.qa-dev/tank-selection'));
const tier = option('tier', 'desktop');
const cpuRate = Number(option('cpu', '4'));
const cycles = Number(option('cycles', '2'));
const dwellMs = Number(option('dwell', '500'));
const thumbnailTimeoutMs = Number(option('thumb-timeout', '15000'));
assert.ok(['gallery', 'garage'].includes(surface));
assert.ok(['desktop', 'mobile'].includes(tier));
assert.ok(ids.length && ids.every(id => /^[a-z0-9_]+$/.test(id)));
assert.ok(Number.isFinite(cpuRate) && cpuRate >= 1 && cpuRate <= 20);
assert.ok(Number.isInteger(cycles) && cycles >= 1 && cycles <= 8);
assert.ok(Number.isFinite(dwellMs) && dwellMs >= 0 && dwellMs <= 5000);
assert.ok(Number.isFinite(thumbnailTimeoutMs) && thumbnailTimeoutMs >= 100 && thumbnailTimeoutMs <= 60000);
mkdirSync(output, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const identityPaths = ['src/vehicles/materials.ts', 'src/vehicles/tankFactoryCore.ts',
  'src/vehicles/fleetFactory.ts', 'src/gallery/gallery.ts', 'src/game/garagePedestalRuntime.ts',
  'src/ui/tankThumbs.ts', 'src/ui/portraitFraming.ts', 'src/ui/garage.ts', 'src/ui/garage.css',
  'src/vehicles/suppliedSourceFleetSpecs.ts', 'src/vehicles/interiorFillLoaders.generated.ts',
  ...ids.map(id => `public/icons/thumbs/${id}_angle.webp`),
  ...readdirSync('src/vehicles/profiles').filter(name => name.endsWith('.ts')).map(name => `src/vehicles/profiles/${name}`),
  ...readdirSync('src/vehicles/interiorFillGroups').filter(name => name.endsWith('.ts')).map(name => `src/vehicles/interiorFillGroups/${name}`)];
// Preserve missing portrait evidence so the browser can expose its real error
// and fallback path instead of aborting acquisition while holding the lease.
const identity = () => Object.fromEntries(identityPaths.map(path => [path,
  existsSync(path) ? hash(readFileSync(path)) : null]));
const report = { schemaVersion: 2, surface, tier: surface === 'gallery' ? 'high (production Gallery)' : tier,
  cpuRate, cycles, dwellMs, ids, viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  build: 'Production UI paths served by the Vite development server; not a production-bundle timing test.',
  cache: 'Fresh browser; first cycle then repeat visits exceeding the pedestal cache; production prefetch remains enabled.',
  timing: 'Pointerdown to observed UI/stage readiness; screenshot-completion upper bound on composited evidence. RAF gaps are callback intervals, not FPS.',
  thumbnailProtocol: 'Passive DOM state after each timing screenshot; separate thumbnail verification starts only after all timed selections and rapid switching. No forced image loading/decoding, normalization drain or UI mutation. Selected and currently visible cards must load, frame and finish their opacity transition.',
  thumbnailTimeoutMs, thumbnailRows: [],
  acquisitionSha256: hash(readFileSync(new URL(import.meta.url))), before: null, rows: [], errors: [], resourceErrors: [] };
const save = () => writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
const lock = createCaptureLock();
await lock.acquire(45 * 60 * 1000);
report.before = identity();
const heartbeat = setInterval(() => lock.refresh(), 30000);
let server, browser;
const sleep = ms => new Promise(done => setTimeout(done, ms));

try {
  server = await createServer({ root: process.cwd(), logLevel: 'error',
    server: { port: 7492, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } } });
  await server.listen();
  browser = await puppeteer.launch({ headless: 'new', args: [
    '--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport(report.viewport);
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  await cdp.send('Performance.enable');
  page.on('pageerror', error => report.errors.push(String(error)));
  await page.evaluateOnNewDocument(() => {
    const probe = window.__SELECTION_PROBE = { frames: [], tasks: [], pointerAt: null };
    let previous = performance.now();
    const tick = at => {
      if (probe.frames.length < 30000) probe.frames.push({ at, gap: at - previous });
      previous = at;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    new PerformanceObserver(list => {
      for (const item of list.getEntries()) if (probe.tasks.length < 5000) {
        probe.tasks.push({ at: item.startTime, ms: item.duration });
      }
    }).observe({ type: 'longtask', buffered: true });
    document.addEventListener('pointerdown', event => {
      if (event.target.closest?.('.vehicle-card,.cot-card')) probe.pointerAt = performance.now();
    }, true);
    // Observation only. The production IntersectionObserver and idle queue own
    // image requests, decode, framing and reveal; this probe never drains them.
    const imageReceipt = (img, style, framed) => ({
          imagePresent: !!img, complete: img?.complete ?? false,
          naturalWidth: img?.naturalWidth ?? 0, naturalHeight: img?.naturalHeight ?? 0,
          src: img?.getAttribute('src') ?? null, currentSrc: img?.currentSrc ?? null,
          portraitReady: img?.dataset.cotPortraitReady ?? null, framed,
          fallback: img?.dataset.cotIconFallback ?? null, opacity: style?.opacity ?? null,
          visibility: style?.visibility ?? null, boxWidth: img?.clientWidth ?? 0, boxHeight: img?.clientHeight ?? 0,
          frame: img ? Object.fromEntries(['x', 'y', 'scale'].map(key => [key,
            img.style.getPropertyValue(`--cot-thumb-${key}`)])) : null
    });
    probe.thumbnails = () => {
      const cards = [...document.querySelectorAll('.cot-card')].flatMap(card => {
        const box = card.getBoundingClientRect();
        const rail = card.closest('.cot-cards')?.getBoundingClientRect();
        if (!rail || box.width <= 0 || box.height <= 0) return [];
        const visibleWidth = Math.min(box.right, rail.right, innerWidth) - Math.max(box.left, rail.left, 0);
        const visibleHeight = Math.min(box.bottom, rail.bottom, innerHeight) - Math.max(box.top, rail.top, 0);
        if (visibleWidth <= 1 || visibleHeight <= 1) return [];
        const img = card.querySelector('img[data-cot-thumb]');
        const style = img ? getComputedStyle(img) : null;
        const framed = img?.dataset.cotPortraitFramed ?? null;
        const ready = !!(img?.complete && img.naturalWidth > 0 && img.naturalHeight > 0
          && img.dataset.cotPortraitReady === 'true' && ['true', 'fallback'].includes(framed)
          && style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) >= .99);
        return [{ id: card.dataset.specId, selected: card.classList.contains('sel'), ready,
          ...imageReceipt(img, style, framed) }];
      });
      return { observedAt: performance.now(), cards,
        selectedReady: cards.some(card => card.selected && card.ready),
        allVisibleReady: cards.length > 0 && cards.every(card => card.ready) };
    };
  });
  const base = `http://localhost:${server.config.server.port}`;
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith(base)
        && !response.url().endsWith('/favicon.ico')) {
      report.resourceErrors.push({ url: response.url(), status: response.status() });
    }
  });
  await page.goto(surface === 'gallery' ? `${base}/gallery.html?id=m1a1`
    : `${base}/?nosplash=1&tier=${tier}&gfxreset=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(kind => kind === 'gallery'
    ? window.__TANK_GALLERY_READY && document.querySelector('#loadingState.hidden')
    : window.__GAME_READY && window.__DEBUG?.pedestalVisual?.root.visible,
  { timeout: 180000 }, surface);
  await sleep(3500);
  report.browser = await browser.version();
  const countries = surface === 'garage' ? await page.evaluate(async requested => {
    const { getSpec } = await import('/src/vehicles/specs.ts');
    const { flagIconCode } = await import('/src/ui/flagCodes.ts');
    return Object.fromEntries(requested.map(id => [id, flagIconCode(getSpec(id).nation)]));
  }, ids) : {};

  async function click(selector) {
    const element = await page.$(selector);
    assert.ok(element, `Missing real selection control ${selector}`);
    await element.evaluate(node => node.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' }));
    const bounds = await element.boundingBox();
    assert.ok(bounds?.width && bounds?.height, `Hidden selection control ${selector}`);
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await element.dispose();
  }
  async function select(id) {
    if (surface === 'garage') {
      const chip = `.cot-country-chip[data-country="${countries[id]}"]`;
      if (!await page.$eval(chip, node => node.classList.contains('sel'))) await click(chip);
    }
    await click(surface === 'gallery' ? `.vehicle-card[data-id="${id}"]` : `.cot-card[data-spec-id="${id}"]`);
  }
  async function settled(id) {
    await page.waitForFunction((kind, target) => {
      if (kind === 'gallery') return window.__TANK_GALLERY?.getState().selectedId === target
        && document.querySelector('#loadingState.hidden')
        && document.querySelector(`.vehicle-card.active[data-id="${target}"]`);
      const debug = window.__DEBUG;
      return debug?.selectedSpecId === target && debug.pedestalVisual?.specId === target
        && debug.pedestalVisual.root.visible && debug.pedestalVisual.root.parent
        && document.querySelector(`.cot-card.sel[data-spec-id="${target}"]`);
    }, { timeout: 60000, polling: 'raf' }, surface, id);
    return page.evaluate(async () => {
      const readyAt = performance.now();
      await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
      return { readyAt, pointerAt: window.__SELECTION_PROBE.pointerAt };
    });
  }
  async function record(id, phase, ordinal) {
    const times = await settled(id);
    const filename = `${String(ordinal).padStart(3, '0')}-${phase}-${id}.png`;
    const pixels = await page.screenshot({ path: resolve(output, filename) });
    const row = await page.evaluate(({ start, readyAt }) => {
      const end = performance.now(), probe = window.__SELECTION_PROBE;
      const frames = probe.frames.filter(row => row.at >= start && row.at <= readyAt);
      const tasks = probe.tasks.filter(row => row.at >= start && row.at <= readyAt);
      const info = window.__DEBUG?.renderer?.info;
      return { pointerAt: start, uiReadyMs: readyAt - start,
        compositedEvidenceUpperBoundMs: end - start,
        rafMaxGapMs: Math.max(0, ...frames.map(row => row.gap)), longTasks: tasks,
        heapBytes: performance.memory?.usedJSHeapSize ?? null,
        renderer: info ? { geometries: info.memory.geometries, textures: info.memory.textures,
          programs: info.programs?.length, calls: info.render.calls, triangles: info.render.triangles } : null,
        productionSwitch: window.__SWITCH_TIMINGS?.at(-1) ?? null };
    }, { start: times.pointerAt, readyAt: times.readyAt });
    assert.ok(Number.isFinite(row.pointerAt), 'Actual pointer request must be observed');
    const thumbnailsAtEvidence = surface === 'garage'
      ? await page.evaluate(() => window.__SELECTION_PROBE.thumbnails()) : null;
    report.rows.push({ id, phase, ...row, screenshot: filename, screenshotSha256: hash(pixels), thumbnailsAtEvidence });
    save();
    console.log(`${surface}/${phase}/${id}: UI ${row.uiReadyMs.toFixed(1)}ms, screenshot upper bound ${row.compositedEvidenceUpperBoundMs.toFixed(1)}ms`);
  }
  for (let cycle = 0; cycle < cycles; cycle++) {
    for (const id of ids) {
      await select(id);
      await record(id, cycle === 0 ? 'first-cycle' : `repeat-${cycle}`, report.rows.length);
      await sleep(dwellMs);
    }
    await cdp.send('HeapProfiler.collectGarbage');
  }
  // Rapid real pointer requests use the same national controls/cards. Only the
  // final selection must converge; superseded builds are legitimately cancelled.
  for (const id of [...ids].reverse()) { await select(id); await sleep(90); }
  await record(ids[0], 'rapid-final', report.rows.length);
  const sorted = report.rows.map(row => row.uiReadyMs).sort((a, b) => a - b);
  report.uiReady = { p50: sorted[Math.floor(sorted.length * .50)],
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))], max: sorted.at(-1) };
  // Keep these waits outside the entire timing acquisition, not just outside
  // each row's stopwatch: otherwise they warm the next timed selection.
  if (surface === 'garage') {
    for (const id of ids) {
      await select(id);
      const mainTimes = await settled(id);
      const evidence = await page.evaluate(async timeout => {
        const read = window.__SELECTION_PROBE.thumbnails;
        const startedAt = performance.now(), timeline = [];
        let selectedReadyAt = null, lastSignature = '';
        for (;;) {
          const snapshot = read();
          if (snapshot.selectedReady && selectedReadyAt === null) selectedReadyAt = snapshot.observedAt;
          const signature = JSON.stringify(snapshot.cards);
          if (signature !== lastSignature) { timeline.push(snapshot); lastSignature = signature; }
          if (snapshot.selectedReady && snapshot.allVisibleReady) {
            await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
            const final = read();
            if (final.selectedReady && final.allVisibleReady) return {
              startedAt, selectedReadyAt, settledAt: final.observedAt, timedOut: false, timeline, final };
          }
          if (performance.now() - startedAt >= timeout) return {
            startedAt, selectedReadyAt, settledAt: null, timedOut: true, timeline, final: read() };
          await new Promise(done => setTimeout(done, 50));
        }
      }, thumbnailTimeoutMs);
      const filename = `thumb-settled-${String(report.thumbnailRows.length).padStart(3, '0')}-${id}.png`;
      const pixels = await page.screenshot({ path: resolve(output, filename) });
      const atScreenshot = await page.evaluate(() => window.__SELECTION_PROBE.thumbnails());
      const passed = !evidence.timedOut && atScreenshot.selectedReady && atScreenshot.allVisibleReady;
      report.thumbnailRows.push({ id, mainReadyAt: mainTimes.readyAt, pointerAt: mainTimes.pointerAt,
        ...evidence, atScreenshot, passed, screenshot: filename, screenshotSha256: hash(pixels) });
      save();
      console.log(`${surface}/thumbnails/${id}: ${passed ? 'PASS' : 'FAIL'}, ${atScreenshot.cards.length} visible cards`);
      if (!passed) report.errors.push(`Thumbnail readiness failed for ${id} after ${thumbnailTimeoutMs}ms`);
    }
  }
  report.converged = true;
} catch (error) {
  report.errors.push(String(error));
  report.converged = false;
  process.exitCode = 1;
} finally {
  report.after = identity();
  report.drift = identityPaths.filter(path => report.before[path] !== report.after[path]);
  if (report.errors.length || report.resourceErrors.length || report.drift.length) process.exitCode = 1;
  save();
  await browser?.close();
  await server?.close();
  clearInterval(heartbeat);
  lock.release();
}
